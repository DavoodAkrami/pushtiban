import type { Metadata } from "next";
import { OverviewPanel } from "./overview-panel";

export const metadata: Metadata = {
  title: "نمای کلی — پشتیبان",
};

const OverviewPage = () => <OverviewPanel />;

export default OverviewPage;
