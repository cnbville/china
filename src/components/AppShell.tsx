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
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6">
        <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)_290px] lg:gap-8">
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
