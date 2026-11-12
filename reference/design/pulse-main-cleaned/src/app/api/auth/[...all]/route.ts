import { getAuth } from "@/server/auth";

// better-auth's endpoints (sign in, sign up, change password, delete account, ...): what toNextJsHandler does, but
// resolved per request so the config and database are never read at build time.
const handler = (req: Request) => getAuth().handler(req);

export { handler as GET, handler as POST };
