import { config } from "dotenv";

// Test env first (wins), then dev env as fallback for shared values.
config({ path: ".env.test", quiet: true });
config({ path: ".env.local", quiet: true });
