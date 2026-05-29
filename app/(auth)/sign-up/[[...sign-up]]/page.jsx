import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

function getRedirectUrl(searchParams) {
  const redirectUrl = searchParams?.redirect_url;

  if (typeof redirectUrl === "string" && redirectUrl.startsWith("/")) {
    return redirectUrl;
  }

  return "/dashboard";
}

export default async function SignUpPage({ searchParams }) {
  const { userId } = auth();
  const redirectUrl = getRedirectUrl(await searchParams);

  if (userId) {
    redirect(redirectUrl);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F7F4EE",
      }}
    >
      <SignUp
        forceRedirectUrl={redirectUrl}
        fallbackRedirectUrl={redirectUrl}
        signInUrl="/sign-in"
      />
    </div>
  );
}
