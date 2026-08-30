import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { decodeToken } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    try {
      const sessionStr =
        typeof window !== "undefined" ? localStorage.getItem("riotous_session") : null;
      if (!sessionStr) {
        throw redirect({
          to: "/auth",
          search: {
            redirect: location.pathname !== "/auth" ? location.pathname : undefined,
          },
        });
      }

      const user = decodeToken(sessionStr);
      if (!user?.id) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("riotous_session");
        }
        throw redirect({
          to: "/auth",
          search: {
            redirect: location.pathname !== "/auth" ? location.pathname : undefined,
          },
        });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          user_metadata: { full_name: user.fullName },
        },
      };
    } catch (err: any) {
      if (err?.isRedirect || err?.to) throw err;
      throw redirect({
        to: "/auth",
        search: {
          redirect: location.pathname !== "/auth" ? location.pathname : undefined,
        },
      });
    }
  },
  component: () => <Outlet />,
});
