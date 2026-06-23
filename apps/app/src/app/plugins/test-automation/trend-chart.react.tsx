/** @jsxImportSource react */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TestTrendPoint } from "./test-automation-api";

type Props = {
  trend: TestTrendPoint[];
};

export function TestTrendChart(props: Props) {
  const data = props.trend.map((row) => ({
    day: row.day.slice(5),
    passed: row.passed,
    failed: row.failed,
  }));

  if (!data.length) {
    return (
      <p className="mt-4 text-sm text-neutral-500">
        暂无趋势数据。运行 test-runner 并写入 <code className="font-mono text-xs">.openwork/test-results.json</code>{" "}
        后刷新。
      </p>
    );
  }

  return (
    <div className="mt-4 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="passed" name="通过" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="failed" name="失败" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
