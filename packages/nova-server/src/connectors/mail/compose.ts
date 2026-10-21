// Fabrique un message RFC 822 à partir d'un brouillon, avec nodemailer (sans rien envoyer).

import nodemailer from "nodemailer";
import type { Draft } from "./backend.js";

const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });

export async function compose(from: string, d: Draft): Promise<Buffer> {
  const info = await composer.sendMail({
    from,
    to: d.to,
    cc: d.cc,
    subject: d.subject,
    text: d.body,
    inReplyTo: d.inReplyTo,
    references: d.inReplyTo,
  });
  return info.message as Buffer;
}
