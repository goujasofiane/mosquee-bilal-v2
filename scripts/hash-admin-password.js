#!/usr/bin/env node
/** Usage: node scripts/hash-admin-password.js "votreMotDePasse" */
const bcrypt = require("bcryptjs");
const pwd = process.argv[2];
if (!pwd) {
  console.error('Usage: node scripts/hash-admin-password.js "votreMotDePasse"');
  process.exit(1);
}
console.log(bcrypt.hashSync(pwd, 12));
