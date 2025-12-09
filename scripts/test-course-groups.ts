import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function test() {
  try {
    const courses = await sql`
      SELECT
        et.course_id,
        et.requirement,
        COUNT(DISTINCT et.associate_name) as employee_count,
        COALESCE(cc.action, 'pending') as action,
        cc.t_code
      FROM external_training et
      LEFT JOIN course_cleanup cc ON et.course_id = cc.course_id
      WHERE et.requirement ~ 'T[0-9]{3}'
      GROUP BY et.course_id, et.requirement, cc.action, cc.t_code
      ORDER BY et.requirement
    `;
    console.log("Got", courses.length, "courses");

    // Group by T-Code
    const tCodeGroups: Record<string, { tCode: string; courses: any[] }> = {};
    for (const course of courses) {
      const tCodeMatch = course.requirement.match(/\bT(\d{3}[A-Z]?)\b/);
      const tCode = course.t_code || (tCodeMatch ? "T" + tCodeMatch[1] : null);
      if (tCode === null) continue;

      if (!tCodeGroups[tCode]) {
        tCodeGroups[tCode] = { tCode, courses: [] };
      }
      tCodeGroups[tCode].courses.push(course);
    }

    const allGroups = Object.values(tCodeGroups);
    const multiCourse = allGroups.filter(g => g.courses.length > 1);

    console.log("Total T-Code groups:", allGroups.length);
    console.log("Multi-course groups:", multiCourse.length);

    console.log("\nFirst 5 multi-course groups:");
    for (const g of multiCourse.slice(0, 5)) {
      console.log(`  ${g.tCode}: ${g.courses.length} courses`);
      for (const c of g.courses) {
        console.log(`    - ${c.course_id}: ${c.requirement.substring(0, 60)}...`);
      }
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
