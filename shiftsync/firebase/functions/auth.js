/**
 * JWT authentication for ShiftSync Firebase Functions.
 */
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const SECRET = process.env.JWT_SECRET || "shiftsync-firebase-secret-2025";
const EXPIRE = "8h";

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function verifyPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function createToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRE });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ detail: "Missing token" });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}

module.exports = { hashPassword, verifyPassword, createToken, verifyToken, authMiddleware };
