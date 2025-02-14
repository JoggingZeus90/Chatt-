import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, UserRole, UserRoleType } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Role-based middleware
export function requireRole(role: UserRoleType) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userRole = req.user.role;

    if (role === UserRole.ADMIN && userRole !== UserRole.ADMIN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    if (role === UserRole.MODERATOR && 
        ![UserRole.ADMIN, UserRole.MODERATOR].includes(userRole as UserRoleType)) {
      return res.status(403).json({ message: "Moderator access required" });
    }

    next();
  };
}

// Check suspension middleware
function checkSuspension(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user.suspended) {
    req.logout((err) => {
      if (err) {
        console.error('Error logging out suspended user:', err);
      }
      res.status(403).json({
        message: "Your account has been suspended",
        reason: req.user.suspendedReason,
        suspendedAt: req.user.suspendedAt
      });
    });
    return;
  }
  next();
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Add suspension check middleware after authentication is set up
  app.use(checkSuspension);

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }

        // Check if user is suspended during login
        if (user.suspended) {
          return done(null, false, { 
            message: "Your account has been suspended",
            reason: user.suspendedReason,
            suspendedAt: user.suspendedAt
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }

      // Check if user is suspended during session verification
      if (user.suspended) {
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
      role: UserRole.USER, // Default role for new users
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    if (req.user.suspended) {
      req.logout((err) => {
        if (err) console.error('Error logging out suspended user:', err);
        res.status(403).json({
          message: "Your account has been suspended",
          reason: req.user.suspendedReason,
          suspendedAt: req.user.suspendedAt
        });
      });
      return;
    }
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user.suspended) {
      req.logout((err) => {
        if (err) console.error('Error logging out suspended user:', err);
        res.status(403).json({
          message: "Your account has been suspended",
          reason: req.user.suspendedReason,
          suspendedAt: req.user.suspendedAt
        });
      });
      return;
    }
    res.json(req.user);
  });
}