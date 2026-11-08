"use client";
import { demoMode } from "@/lib/data";
import { localCollab } from "./local";
import { supabaseCollab } from "./supabase";
import type { CollabApi } from "./types";

/** Участники, приглашения и публикации: Supabase или демо-режим, как и основной слой данных */
export const collab: CollabApi = demoMode ? localCollab : supabaseCollab;
export { demoInviteInbox } from "./local";
export { InvitationError } from "./errors";
export * from "./types";
