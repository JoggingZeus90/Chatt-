import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
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
  try {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}

export function requireRole(role: UserRoleType) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userRole = req.user.role;

    if (userRole === UserRole.OWNER) {
      return next();
    }

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

async function findOrCreateUser(profile: any, provider: string) {
  let user = await storage.getUserByUsername(`${provider}:${profile.id}`);

  if (!user) {
    // Create a new user
    user = await storage.createUser({
      username: `${provider}:${profile.id}`,
      password: await hashPassword(randomBytes(32).toString('hex')), // Random password
      role: UserRole.USER,
      avatarUrl: profile.photos?.[0]?.value || null,
    });
  }

  return user;
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
  app.use(checkSuspension);

  // Local Strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }

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

  // GitHub Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/auth/github/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, 'github');
        done(null, user);
      } catch (error) {
        done(error);
      }
    }));
  }

  // Google Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, 'google');
        done(null, user);
      } catch (error) {
        done(error);
      }
    }));
  }

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }

      if (user.suspended) {
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Authentication Routes
  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
      role: UserRole.USER,
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    if (req.user?.suspended) {
      req.logout((err) => {
        if (err) console.error('Error logging out suspended user:', err);
        res.status(403).json({
          message: "Your account has been suspended",
          reason: req.user?.suspendedReason,
          suspendedAt: req.user?.suspendedAt
        });
      });
      return;
    }
    res.status(200).json(req.user);
  });

  // GitHub auth routes
  app.get('/api/auth/github',
    passport.authenticate('github', { scope: ['user:email'] })
  );

  app.get('/api/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/auth' }),
    (req, res) => res.redirect('/')
  );

  // Google auth routes
  app.get('/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/auth' }),
    (req, res) => res.redirect('/')
  );

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