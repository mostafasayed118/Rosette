'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

type Tab = { value: string; label: string };

type RequestTabsProps = {
  basePath: string;
  tabs: Tab[];
  current: string;
  paramName?: string;
};

export function RequestTabs({ basePath, tabs, current, paramName = 'status' }: RequestTabsProps) {
  return (
    <Tabs defaultValue={current} className="mt-4">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link href={`${basePath}?${paramName}=${tab.value}`}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
