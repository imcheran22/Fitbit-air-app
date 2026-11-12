import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

/** better-auth in the browser: same-origin calls to /api/auth/*. */
export const authClient = createAuthClient({ plugins: [usernameClient()] });
