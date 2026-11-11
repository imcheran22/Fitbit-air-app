// A development screen. In a release build __DEV__ is false, Metro folds the condition away before it collects
// dependencies, and the screen (with the fixtures it imports) stays out of the bundle.
import { NotInRelease } from "@/dev/NotInRelease";

// eslint-disable-next-line @typescript-eslint/no-require-imports
export default __DEV__ ? require("@/dev/kit/home").default : NotInRelease;
