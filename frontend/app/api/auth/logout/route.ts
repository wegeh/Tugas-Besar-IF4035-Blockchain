import { NextResponse } from "next/server"

export async function POST() {
  const res = NextResponse.json({ message: "Logged out." })
  res.cookies.set({
    name: "cl_session",
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
