function StatCard({ title, value, color }) {
  return (
    <div
      style={{
        background: "white",
        padding: "25px",
        borderRadius: "12px",
        boxShadow: "0 5px 15px rgba(0,0,0,0.08)",
        borderLeft: `6px solid ${color}`,
      }}
    >
      <h3>{title}</h3>

      <h1
        style={{
          color,
          marginTop: "10px",
          fontSize: "32px",
        }}
      >
        {value}
      </h1>
    </div>
  );
}

export default StatCard;