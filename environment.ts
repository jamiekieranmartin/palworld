import "dotenv/config";

const GCP_ORG_ID = process.env.GCP_ORG_ID ?? "";
if (!GCP_ORG_ID) {
  throw new Error("GCP_ORG_ID is required");
}

const GCP_BILLING_ACCOUNT = process.env.GCP_BILLING_ACCOUNT ?? "";
if (!GCP_BILLING_ACCOUNT) {
  throw new Error("GCP_BILLING_ACCOUNT is required");
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD is required");
}

const SERVER_PASSWORD = process.env.SERVER_PASSWORD ?? "";
if (!SERVER_PASSWORD) {
  throw new Error("SERVER_PASSWORD is required");
}

export { GCP_ORG_ID, GCP_BILLING_ACCOUNT, SERVER_PASSWORD, ADMIN_PASSWORD };
