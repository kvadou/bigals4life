import { BrandMark } from "../components/brand-mark";
import Link from "next/link";
import SignOut from "./sign-out";

export default function WaitingPage() {
  return <main>
    <header className="topbar"><Link className="brand" href="/" aria-label="Big Al's 4 Life home"><span className="brand-icon"><BrandMark size={36}/></span>BA4L</Link><span className="league-tag"><span/> TEAM ONLY</span></header>
    <section className="login-card">
      <div className="eyebrow">ALMOST</div>
      <h1>You&rsquo;re signed in, but not on the team yet.</h1>
      <p>Big Al&rsquo;s 4 Life scorebooks are private to the four of us. Doug adds teammates by email. Once he&rsquo;s added the address you signed in with, this page turns into the scorebook.</p>
      <SignOut/>
    </section>
    <footer><span>BA4L</span><span>Big Al&rsquo;s 4 Life.</span></footer>
  </main>;
}
