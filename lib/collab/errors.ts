import { ApiError } from "@/lib/data/api";
import { invitationMessages, type InvitationFailure } from "./types";

export class InvitationError extends ApiError {
  constructor(public reason: InvitationFailure) {
    super(invitationMessages[reason], reason === "auth" ? "auth" : "invalid");
  }
}
