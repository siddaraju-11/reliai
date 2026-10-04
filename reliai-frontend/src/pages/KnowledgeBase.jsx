import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

function KnowledgeBase() {
  const issues = [
    {
      id: 1,
      category: "Node.js",
      error: "Cannot find module 'express'",
      solution: "Run: npm install express",
    },
    {
      id: 2,
      category: "Docker",
      error: "Image not found",
      solution: "Verify Docker image name and registry.",
    },
    {
      id: 3,
      category: "Jenkins",
      error: "Pipeline script failed",
      solution: "Check Jenkinsfile syntax and plugins.",
    },
    {
      id: 4,
      category: "Maven",
      error: "Dependency resolution failed",
      solution: "Run mvn clean install and check pom.xml.",
    },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f4f7fc" }}>
      <Sidebar />

      <div style={{ flex: 1 }}>
        <Navbar />

        <div style={{ padding: "30px" }}>
          <h1>📚 Knowledge Base</h1>

          <input
            type="text"
            placeholder="Search errors..."
            style={{
              width: "100%",
              padding: "12px",
              margin: "20px 0",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          />

          <table
            style={{
              width: "100%",
              background: "white",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ background: "#2563eb", color: "white" }}>
                <th style={{ padding: "12px" }}>Category</th>
                <th>Error</th>
                <th>Suggested Fix</th>
              </tr>
            </thead>

            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td style={{ padding: "12px" }}>{issue.category}</td>
                  <td>{issue.error}</td>
                  <td>{issue.solution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default KnowledgeBase;