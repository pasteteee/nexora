"use client";
/** Точка входа слоя данных: Supabase, если заданы ключи, иначе демо-режим на localStorage. */
import { isSupabaseConfigured } from "@/lib/config";
import type { AuthApi, DataApi } from "./api";
import { localAuth, localData } from "./local";
import { supabaseAuth } from "./supabase-auth";

export const demoMode = !isSupabaseConfigured;
export const auth: AuthApi = demoMode ? localAuth : supabaseAuth;
export const data: DataApi = localData;

export { ApiError } from "./api";
export { localAuth, consumeToken } from "./local";
