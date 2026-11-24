import accountHandler from "../lib/handlers/account.js";
import avatarHandler from "../lib/handlers/avatar.js";
import contactHandler from "../lib/handlers/contact.js";
import emailHandler from "../lib/handlers/email.js";
import fileHandler from "../lib/handlers/file.js";
import friendsHandler from "../lib/handlers/friends.js";
import geoHandler from "../lib/handlers/geo.js";
import handshakeHandler from "../lib/handlers/handshake.js";
import integrationsHandler from "../lib/handlers/integrations.js";
import ingestHandler from "../lib/handlers/ingest.js";
import lastfmCallbackHandler from "../lib/handlers/lastfm-callback.js";
import logoutHandler from "../lib/handlers/logout.js";
import logsHandler from "../lib/handlers/logs.js";
import meHandler from "../lib/handlers/me.js";
import mediaHandler from "../lib/handlers/media.js";
import messagesHandler from "../lib/handlers/messages.js";
import ownerHandler from "../lib/handlers/owner.js";
import previewHandler from "../lib/handlers/preview.js";
import presenceHandler from "../lib/handlers/presence.js";
import recoverHandler from "../lib/handlers/recover.js";
import roomsHandler from "../lib/handlers/rooms.js";
import shellHandler from "../lib/handlers/shell.js";
import steamCallbackHandler from "../lib/handlers/steam-callback.js";
import typingHandler from "../lib/handlers/typing.js";
import unreadHandler from "../lib/handlers/unread.js";
import usersHandler from "../lib/handlers/users.js";

const handlers = {
  account: accountHandler,
  avatar: avatarHandler,
  contact: contactHandler,
  email: emailHandler,
  file: fileHandler,
  friends: friendsHandler,
  geo: geoHandler,
  handshake: handshakeHandler,
  integrations: integrationsHandler,
  ingest: ingestHandler,
  "lastfm-callback": lastfmCallbackHandler,
  logout: logoutHandler,
  logs: logsHandler,
  me: meHandler,
  media: mediaHandler,
  messages: messagesHandler,
  owner: ownerHandler,
  presence: presenceHandler,
  preview: previewHandler,
  recover: recoverHandler,
  rooms: roomsHandler,
  shell: shellHandler,
  "steam-callback": steamCallbackHandler,
  typing: typingHandler,
  unread: unreadHandler,
  users: usersHandler,
};

export default async function handler(req, res) {
  const route = req.query.route;
  const h = handlers[route];

  if (!h) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(404).json({ error: "Not found" });
    return;
  }

  return h(req, res);
}
