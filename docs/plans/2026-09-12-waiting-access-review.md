# Waiting-page access routing review

Status: prepared and tested in isolation, not applied or published. Awaiting Doug’s approval under the authentication review rule supplied in AGENTS.md. The visual release does not alter proxy authentication logic.

The all-page UI sweep reproduced a confirmed nonmember waiting-page redirect failure. The proxy currently redirects every confirmed user away from login/waiting before checking membership. The proposed change checks membership first, leaves confirmed nonmembers on waiting, redirects confirmed nonmembers from login to waiting, and preserves the gate on protected pages. Admin and existing member behavior stays the same.

```diff
--- a/web/proxy.ts
+++ b/web/proxy.ts
@@ -32,10 +32,12 @@
     if ((path !== "/" || request.nextUrl.search) && /^\/(?![\/\\])/.test(next)) login.searchParams.set("next", next);
     return NextResponse.redirect(login);
   }
-  if (open) return NextResponse.redirect(new URL("/", request.url));
   const admins = (process.env.BAFL_ADMIN_EMAILS ?? "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
-  if (admins.includes(user!.email!.toLowerCase())) return response;
-  const onTeam = await isTeammate(user!.id, user!.email!);
+  const onTeam = admins.includes(user!.email!.toLowerCase()) || await isTeammate(user!.id, user!.email!);
+  if (open) {
+    if (onTeam) return NextResponse.redirect(new URL("/", request.url));
+    return path === "/waiting" ? response : NextResponse.redirect(new URL("/waiting", request.url));
+  }
   return onTeam ? response : NextResponse.rewrite(new URL("/waiting", request.url));
 }
 
```

Isolated actual-proxy regression matrix: original 33 passed/10 failed; candidate 43 passed/0 failed, 184 assertions. All Supabase and fetch responses mocked; signed-out, unconfirmed, member, invite, admin, nonmember, unavailable service and exact public asset paths covered. This is not browser verification of the candidate. After approval: apply patch, retain isolated regression tests, verify the nonmember page in the browser, build and deploy.

Local test evidence: /tmp/ba4l-waiting-access-regression/proxy-access.test.ts and results.txt. No actual auth data changed.
