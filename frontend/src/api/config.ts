export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  timeout: 30000,
  cognitoRegion:     import.meta.env.VITE_COGNITO_REGION     || "us-east-1",
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
  cognitoClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID   || "",
};