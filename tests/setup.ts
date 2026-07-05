import { config } from "dotenv";

// Test env first (wins), then dev env as fallback for shared values.
config({ path: ".env.test" });
config({ path: ".env.local" });
