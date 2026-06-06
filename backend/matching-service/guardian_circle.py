"""
Guardian Circle Manager — builds and maintains per-patient donor cohorts.
"""
import uuid
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from shared.models import (
    Patient, Donor, Person, AntigenProfile,
    GuardianCircle, TransfusionRequest
)
from shared.schemas import DonorMatchResult, CompatibilityResult, DonorStatus, Language
from compatibility import compute_compatibility, to_antigen_dataclass, rank_donors

logger = logging.getLogger("guardian-circle")

CIRCLE_SIZE      = 10   # target donors per patient
MIN_SCORE        = 0.50  # minimum compatibility to enter circle
CHURN_THRESHOLD  = 0.60  # replace donor above this risk


class GuardianCircleManager:

    async def build_circle(
        self,
        patient_id: str,
        gnn_ranker,
        db: AsyncSession,
    ) -> int:
        """
        Build or rebuild a patient's Guardian Circle.
        Scores ALL verified donors against patient, selects top CIRCLE_SIZE.
        Returns count of donors in new circle.
        """
        # Load patient antigen profile
        patient_result = await db.execute(
            select(AntigenProfile)
            .join(Patient, Patient.person_id == AntigenProfile.person_id)
            .where(Patient.id == patient_id)
        )
        patient_profile = patient_result.scalar_one_or_none()
        if not patient_profile:
            raise ValueError(f"No antigen profile for patient {patient_id}")

        patient_ag = to_antigen_dataclass(patient_profile)

        # Load all verified donors with profiles (same city first, then expand)
        donor_result = await db.execute(
            select(Donor, Person, AntigenProfile)
            .join(Person, Donor.person_id == Person.id)
            .join(AntigenProfile, AntigenProfile.person_id == Person.id)
            .where(Donor.verified == True)
            .order_by(Donor.lifetime_donations.desc())
        )
        donor_rows = donor_result.all()

        # Score all donors
        donor_profiles = [
            (donor.id, to_antigen_dataclass(profile))
            for donor, person, profile in donor_rows
        ]
        ranked = rank_donors(patient_ag, donor_profiles, min_score=MIN_SCORE)

        # Optionally re-rank with GNN (enhances with behavioral embeddings)
        if gnn_ranker and gnn_ranker.is_loaded:
            ranked = await gnn_ranker.rerank(ranked, patient_id, [r["donor_id"] for r in ranked])

        # Remove existing circle entries
        await db.execute(
            GuardianCircle.__table__.delete()
            .where(GuardianCircle.patient_id == patient_id)
        )

        # Insert new circle (top CIRCLE_SIZE)
        inserted = 0
        for rank, scored in enumerate(ranked[:CIRCLE_SIZE], start=1):
            donor_id = scored["donor_id"]
            gc = GuardianCircle(
                id=str(uuid.uuid4()),
                patient_id=patient_id,
                donor_id=donor_id,
                compatibility_score=scored["score"],
                antigen_mismatches=scored["mismatch_count"],
                rank_in_circle=rank,
                status="active",
                churn_risk=0.0,
            )
            db.add(gc)
            inserted += 1

        await db.commit()
        logger.info(f"Built guardian circle for patient {patient_id}: {inserted} donors")
        return inserted

    async def get_available_donors(
        self,
        patient_id: str,
        urgency: str,
        db: AsyncSession,
    ) -> list[DonorMatchResult]:
        """
        Get ranked available donors from Guardian Circle.
        Sorts by: (eligible=True, low churn) DESC, then compatibility DESC.
        """
        result = await db.execute(
            select(GuardianCircle, Donor, Person)
            .join(Donor, GuardianCircle.donor_id == Donor.id)
            .join(Person, Donor.person_id == Person.id)
            .where(
                and_(
                    GuardianCircle.patient_id == patient_id,
                    GuardianCircle.status.in_(["active", "at_risk"]),
                )
            )
            .order_by(
                GuardianCircle.churn_risk.asc(),
                GuardianCircle.compatibility_score.desc(),
            )
        )
        rows = result.all()

        now = datetime.utcnow()
        donors = []
        for gc, donor, person in rows:
            days_eligible = 0
            if donor.last_donation_at:
                days_since = (now - donor.last_donation_at).days
                days_eligible = max(0, 56 - days_since)

            # For critical urgency, include ineligible donors (coordinator decision)
            if days_eligible > 0 and urgency != "critical":
                continue

            donors.append(DonorMatchResult(
                donor_id=donor.id,
                donor_name=person.name,
                phone=person.phone,
                language=Language(person.language),
                compatibility=CompatibilityResult(
                    score=gc.compatibility_score,
                    mismatches=[],
                    mismatch_count=gc.antigen_mismatches,
                    compatible=gc.antigen_mismatches == 0,
                    risk_level=(
                        "safe" if gc.antigen_mismatches == 0
                        else "caution" if gc.antigen_mismatches <= 2
                        else "incompatible"
                    ),
                ),
                churn_probability=gc.churn_risk,
                availability_prob=round(max(0.0, 1.0 - gc.churn_risk), 3),
                days_to_eligible=days_eligible,
                rank=gc.rank_in_circle,
                status=DonorStatus(gc.status),
            ))

        return donors

    async def replace_churned_donors(
        self,
        patient_id: str,
        gnn_ranker,
        db: AsyncSession,
    ) -> int:
        """
        Find at-risk/churned slots in circle and recruit replacements.
        Called daily by scheduler.
        """
        # Find churned slots
        churned_result = await db.execute(
            select(GuardianCircle)
            .where(
                and_(
                    GuardianCircle.patient_id == patient_id,
                    GuardianCircle.churn_risk > CHURN_THRESHOLD,
                )
            )
        )
        churned = churned_result.scalars().all()

        if not churned:
            return 0

        # Get current circle donor IDs to exclude
        circle_result = await db.execute(
            select(GuardianCircle.donor_id)
            .where(GuardianCircle.patient_id == patient_id)
        )
        existing_ids = {row[0] for row in circle_result.all()}

        # Rebuild will handle replacement
        rebuilt = await self.build_circle(patient_id, gnn_ranker, db)
        return len(churned)
