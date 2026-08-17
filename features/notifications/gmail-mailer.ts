import nodemailer from 'nodemailer';
import { getRequiredServerEnv } from '@/lib/server-env';

export type MailTransport = { sendMail: (message: { from: string; to: string; subject: string; text: string; html: string }) => Promise<unknown> };

export function createGmailTransport(): MailTransport {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: getRequiredServerEnv('GMAIL_USER'), pass: getRequiredServerEnv('GMAIL_APP_PASSWORD') },
  });
}
