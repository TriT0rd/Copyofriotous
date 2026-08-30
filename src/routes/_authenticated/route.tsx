import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const sessionStr = localStorage.getItem("riotous_session");
      if (!sessionStr) throw redirect({ to: "/auth" });
      const [payloadStr] = sessionStr.split(".");
      const payload = JSON.parse(atob(payloadStr));
      if (!payload?.id) throw redirect({ to: "/auth" });
      return {
        user: {
          id: payload.id,
          email: payload.email,
          role: payload.role,
          user_metadata: { full_name: payload.fullName },
        },
      };
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
