# CarbonLedgerID Frontend

Next.js app with a simple role-based auth flow wired to Prisma. Use this as a simulation layer until you plug in the real wallet and network.

## Setup
1) Copy envs: `cp .env.example .env.local` and set `DATABASE_URL` to your Supabase PostgreSQL URL.  
2) Install deps: `npm install` (already run once, but rerun if needed).  
3) Generate client and push schema: `npx prisma generate && npx prisma db push`.  
4) Dev server: `npm run dev` (http://localhost:3000).

## Auth API
- `POST /api/auth/register`  
  Body: `{ email, password, role: "company" | "regulator", companyName?, walletAddress? }`  
  Company accounts require `companyName` and `walletAddress`.

- `POST /api/auth/login`  
  Body: `{ email, password }`

Responses include `{ message, user }` or `{ error }`. This is a basic email/password flow using bcrypt; add proper session/JWT handling if you need persistent login.

## What is simulated vs. real
- Wallet connect is simulated via the company sign-in/register button; it stores the wallet address in the database but does not perform a chain signature yet.  
- Dashboard buttons are wired visually; connect them to your real contract calls once your Hardhat deploy + ABIs are ready.

## Cursor + UX tweaks
All buttons now use `cursor-pointer`, the navbar exposes a visible `Sign In` entry, and the hero section links directly to `/dashboard` and `/auth`.
