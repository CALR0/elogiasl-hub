import { redirect } from "next/navigation";

// proxy.ts envía al login si no hay sesión; con sesión, al inicio.
export default function Home() {
  redirect("/inicio");
}
