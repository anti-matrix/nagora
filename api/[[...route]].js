import accountHandler from "../lib/handlers/account.js";
import fileHandler from "../lib/handlers/file.js";
import friendsHandler from "../lib/handlers/friends.js";
import geoHandler from "../lib/handlers/geo.js";
import ingestHandler from "../lib/handlers/ingest.js";
import logoutHandler from "../lib/handlers/logout.js";
import logsHandler from "../lib/handlers/logs.js";
import meHandler from "../lib/handlers/me.js";
import messagesHandler from "../lib/handlers/messages.js";
import presenceHandler from "../lib/handlers/presence.js";
import shellHandler from "../lib/handlers/shell.js";
import typingHandler from "../lib/handlers/typing.js";
import usersHandler from "../lib/handlers/users.js";

const handlers = {
  account: accountHandler,
  file: fileHandler,
  friends: friendsHandler,
  geo: geoHandler,
  ingest: ingestHandler,
  logout: logoutHandler,
  logs: logsHandler,
  me: meHandler,
  messages: messagesHandler,
  presence: presenceHandler,
  shell: shellHandler,
  typing: typingHandler,
  users: usersHandler,
};

export default async function handler(req, res) {
  const route = (req.query.route || [])[0];
  const h = handlers[route];

  if (!h) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(404).json({ error: "Not found" });
    return;
  }

  return h(req, res);
}
