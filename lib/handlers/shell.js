import { kv } from "../../lib/redis.js";
import { createShellHandler } from "../../lib/shell.js";

export default createShellHandler(kv);
