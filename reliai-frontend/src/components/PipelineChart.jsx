import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function PipelineChart({ dashboard }) {
  const data = [
    {
      name: "Pending",
      value: dashboard.pending,
    },
    {
      name: "Running",
      value: dashboard.running,
    },
    {
      name: "Success",
      value: dashboard.success,
    },
    {
      name: "Failed",
      value: dashboard.failed,
    },
  ];

  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        margin: "30px",
        borderRadius: "12px",
        boxShadow: "0 5px 15px rgba(0,0,0,0.08)",
      }}
    >
      <h2>Pipeline Status Overview</h2>

      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="name" />

          <YAxis />

          <Tooltip />

          <Bar
            dataKey="value"
            fill="#2563eb"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PipelineChart;