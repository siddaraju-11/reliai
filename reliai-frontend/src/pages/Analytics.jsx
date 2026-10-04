import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StatCard from "../components/StatCard";

function Analytics() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f4f7fc",
      }}
    >
      <Sidebar />

      <div style={{ flex: 1 }}>
        <Navbar />

        <div style={{ padding: "30px" }}>
          <h1>📊 Analytics Dashboard</h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "20px",
              marginTop: "20px",
            }}
          >
            <StatCard title="Total Builds" value="154" color="#2563eb" />
            <StatCard title="Success Rate" value="92%" color="#16a34a" />
            <StatCard title="Failed Builds" value="12" color="#dc2626" />
            <StatCard title="Reliability" value="94%" color="#9333ea" />
          </div>

          <div
            style={{
              marginTop: "30px",
              background: "white",
              padding: "20px",
              borderRadius: "12px",
              boxShadow: "0 5px 10px rgba(0,0,0,0.1)",
            }}
          >
            <h2>Monthly Build Statistics</h2>

            <table
              style={{
                width: "100%",
                marginTop: "20px",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ background: "#2563eb", color: "white" }}>
                  <th style={{ padding: "12px" }}>Month</th>
                  <th>Total Builds</th>
                  <th>Successful</th>
                  <th>Failed</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td style={{ padding: "12px" }}>January</td>
                  <td>420</td>
                  <td>396</td>
                  <td>24</td>
                </tr>

                <tr>
                  <td style={{ padding: "12px" }}>February</td>
                  <td>480</td>
                  <td>451</td>
                  <td>29</td>
                </tr>

                <tr>
                  <td style={{ padding: "12px" }}>March</td>
                  <td>530</td>
                  <td>500</td>
                  <td>30</td>
                </tr>

                <tr>
                  <td style={{ padding: "12px" }}>April</td>
                  <td>610</td>
                  <td>585</td>
                  <td>25</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;