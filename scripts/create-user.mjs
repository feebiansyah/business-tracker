import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "../lib/generated/prisma/client.ts";
import { hashPassword, validateNewUserInput } from "../lib/auth/credentials.ts";

let hideOutput = false;
const promptOutput = new Writable({
  write(chunk, encoding, callback) {
    if (!hideOutput) stdout.write(chunk, encoding);
    callback();
  },
});
const prompt = createInterface({ input: stdin, output: promptOutput, terminal: true });

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum tersedia.");
  const email = await prompt.question("Email: ");
  const name = await prompt.question("Nama: ");
  hideOutput = true;
  const password = await prompt.question("Password: ");
  hideOutput = false;
  stdout.write("\n");

  const input = validateNewUserInput({ email, name, password });
  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new Error("Email sudah terdaftar.");
    await prisma.user.create({ data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) } });
    stdout.write(`User ${input.email} berhasil dibuat.\n`);
  } finally {
    await prisma.$disconnect();
  }
} catch (error) {
  hideOutput = false;
  stdout.write("\n");
  console.error(error instanceof Error ? error.message : "Gagal membuat user.");
  process.exitCode = 1;
} finally {
  prompt.close();
}
