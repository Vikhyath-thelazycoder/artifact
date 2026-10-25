"use client";

import type { Board, PublicResults } from "@/lib/types";
import { getBrowserSupabase } from "./client";

export async function fetchBoard(): Promise<Board> {
  const { data, error } = await getBrowserSupabase().rpc("public_board");
  if (error) throw new Error(error.message);
  return data as Board;
}

export async function fetchResults(): Promise<PublicResults & { server_now?: string }> {
  const { data, error } = await getBrowserSupabase().rpc("public_results");
  if (error) throw new Error(error.message);
  return data as PublicResults;
}
