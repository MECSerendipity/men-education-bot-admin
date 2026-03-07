/**
 * Generates a bcrypt hash from a plaintext password.
 * Usage: npx tsx admin/scripts/hash-password.ts <password>
 *
 * Copy the output hash into .env as ADMIN_PASSWORD_HASH
 */
import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: npx tsx admin/scripts/hash-password.ts <your-password>');
  process.exit(1);
}

// 12 salt rounds — good balance between security and speed
const hash = await bcrypt.hash(password, 12);

console.log('\n✅ Add this to your .env file:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
