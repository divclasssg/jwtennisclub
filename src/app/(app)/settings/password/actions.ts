"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const passwordPagePath = "/settings/password";
const minimumPasswordLength = 8;

function buildPasswordRedirect(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params);
    return `${passwordPagePath}?${searchParams.toString()}`;
}

export async function changePassword(formData: FormData) {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
        redirect(buildPasswordRedirect({ error: "missing-fields" }));
    }

    if (newPassword.length < minimumPasswordLength) {
        redirect(buildPasswordRedirect({ error: "password-too-short" }));
    }

    if (newPassword !== confirmPassword) {
        redirect(buildPasswordRedirect({ error: "password-mismatch" }));
    }

    if (currentPassword === newPassword) {
        redirect(buildPasswordRedirect({ error: "same-password" }));
    }

    const supabase = await createClient();
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
        redirect("/login");
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });

    if (signInError) {
        redirect(buildPasswordRedirect({ error: "invalid-current-password" }));
    }

    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    });

    if (updateError) {
        redirect(buildPasswordRedirect({ error: "update-failed" }));
    }

    await supabase.auth.signOut();
    redirect("/login?status=password-updated");
}
