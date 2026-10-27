// 生成大门锁的配置：node tools/make_lock.mjs 新密码
// 把输出的几行换进 config.js 的 lock 里。算法要和 lock.js 一致。
import { webcrypto as crypto } from "node:crypto";

var password = process.argv[2];
if (!password) { console.error("用法：node tools/make_lock.mjs 新密码"); process.exit(1); }
var iterations = 200000;
var salt = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64");
var enc = new TextEncoder();
var base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: iterations, hash: "SHA-256" }, base, 256);
var check = Buffer.from(await crypto.subtle.digest("SHA-256", bits)).toString("base64");
console.log('    salt: "' + salt + '",');
console.log("    iterations: " + iterations + ",");
console.log('    check: "' + check + '",');
