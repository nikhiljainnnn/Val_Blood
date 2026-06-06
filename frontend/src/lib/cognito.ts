import { Amplify } from "aws-amplify";
import { API_CONFIG } from "../api/config";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       API_CONFIG.cognitoUserPoolId,
      userPoolClientId: API_CONFIG.cognitoClientId,
      loginWith: {
        phone: true,
      },
    },
  },
});

export {
  signIn,
  signOut,
  confirmSignIn,
  fetchAuthSession,
} from "aws-amplify/auth";