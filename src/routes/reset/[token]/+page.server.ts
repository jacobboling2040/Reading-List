import { fail, redirect } from "@sveltejs/kit";
import { getDb } from "../../../lib/server/db/client";
import { resetPassword } from "../../../lib/server/users";
import { UserError } from "../../../lib/server/errors";
import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request, params }) => {
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    try {
      await resetPassword(getDb(), params.token, password);
    } catch (e) {
      if (e instanceof UserError) return fail(400, { message: e.message });
      throw e;
    }
    redirect(303, "/login?notice=reset");
  },
};
