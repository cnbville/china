import { Header } from "@/components/Header";
import { LeftRail } from "@/components/LeftRail";
import { RightRail } from "@/components/RightRail";

// Three-column shell for the browse screens: the centre keeps a comfortable
// fixed width, with rails filling the flanks on wide screens. Below lg the rails
// drop away and it's just the centre column (mobile untouched).
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)_270px] lg:gap-x-16">
          <aside className="hidden lg:block">
            <LeftRail />
          </aside>
          <div className="min-w-0">{children}</div>
          <aside className="hidden lg:block">
            <RightRail />
          </aside>
        </div>
      </div>
    </>
  );
}
