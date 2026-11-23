import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, normalizeEmail } from '../worker/accounts.js';

test('mot de passe : haché avec sel, vérifié, jamais stocké en clair', async () => {
  const env = {};
  const a = await hashPassword('motdepasse-solide', env);
  const b = await hashPassword('motdepasse-solide', env);
  assert.notEqual(a.pass_hash, b.pass_hash, 'sel aléatoire');
  assert.ok(!a.pass_hash.includes('motdepasse'));
  assert.equal(a.pass_iter, 100_000);
  assert.equal(await verifyPassword('motdepasse-solide', a), true);
  assert.equal(await verifyPassword('motdepasse-Solide', a), false);
});

test('itérations réglables (PASSWORD_ITERATIONS), bornées', async () => {
  assert.equal((await hashPassword('x'.repeat(8), { PASSWORD_ITERATIONS: '50000' })).pass_iter, 50_000);
  assert.equal((await hashPassword('x'.repeat(8), { PASSWORD_ITERATIONS: '5' })).pass_iter, 100_000);
});

test('identifiant = e-mail en minuscules (comme les données synchronisées)', () => {
  assert.equal(normalizeEmail('  Proprio@Exemple.FR '), 'proprio@exemple.fr');
});
