/**
 * lib/redis.js — Shared Upstash Redis client + NAGORA key namespace.
 *
 * NAGORA shares its Upstash Redis with the vdpx project (no separate
 * instance / payment). To keep the two projects' data fully isolated in
 * the same database, EVERY Redis key NAGORA touches is prefixed with the
 * namespace (default "ngr:"). vdpx uses bare keys like `user:<id>` and the
 * `userIds` set; NAGORA uses `ngr:user:<id>` and the `ngr:userIds` set, so
 * neither project can read or clobber the other's records.
 */
import { Redis } from "@upstash/redis";

export const NS = process.env.NAGORA_REDIS_NS || "ngr:";

export const kv = new Redis({
  url  : process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

/** Key for a single user/visitor record. */
export const userKey = (id) => `${NS}user:${id}`;

/** The set of all known NAGORA userIds. */
export const USERIDS = `${NS}userIds`;
