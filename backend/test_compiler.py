import subprocess
import os
import jinja2

def generate_pdf():
    # 1. Setup Jinja2 to use Custom Delimiters (so it doesn't break LaTeX {})
    latex_jinja_env = jinja2.Environment(
        block_start_string='<%',
        block_end_string='%>',
        variable_start_string='<<',
        variable_end_string='>>',
        comment_start_string='<#',
        comment_end_string='#>',
        trim_blocks=True,
        autoescape=False,
        loader=jinja2.FileSystemLoader(os.path.abspath('.'))
    )

    # 2. Dummy JSON Data (Simulating what the React frontend will send)
    student_data = {
        "name": "SAYAK SARDAR",
        "roll_number": "23IE10031",
        "program": "INSTRUMENTATION ENGINEERING (B.Tech)",
        "phone": "+91 9876543210",
        "email": "sayak@example.com",
        "linkedin_url": "https://linkedin.com/in/sayaksardar",
        "linkedin_name": "Sayak Sardar",
        "photo_filename": "photo.jpg",
        "education": [
            {"year": "2027", "degree": "B.Tech", "institute": "IIT Kharagpur", "score": "8.50/10"},
            {"year": "2023", "degree": "Class XII", "institute": "ABC School", "score": "95\\%"}
        ],
        
        # We add one project. The loop will generate it.
        "projects": [
            {
                "title": "Online Placement Info System",
                "location": "IIT Kharagpur",
                "date": "Apr'26",
                "overview": "Engineered a full-stack automated placement portal.",
                "points": [
                    "Developed a live LaTeX resume builder using Python and React.",
                    "Implemented rigorous role-based access control for Admins and Recruiters."
                ]
            }
        ],
        
        # We leave Internships EMPTY. Jinja will skip this entire section.
        "internships": [],
        
        "tech_skills": "C++, Python, Embedded Systems, LaTeX, React",
        "core_expertise": "Algorithms, Hardware Interfacing, Team Leadership"
    }

    print("Loading dynamic template...")
    template = latex_jinja_env.get_template('template.tex')

    print("Injecting data...")
    # 3. Render the LaTeX code with the dictionary data
    rendered_tex = template.render(student_data)

    temp_filename = "output.tex"
    with open(temp_filename, "w", encoding="utf-8") as file:
        file.write(rendered_tex)

    print("Compiling PDF...")
    # 4. Run pdflatex
    try:
        subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", temp_filename],
            check=True,
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE
        )
        print("Success! output.pdf has been generated.")
    except subprocess.CalledProcessError as e:
        print("Error during LaTeX compilation.")
        print(e.stderr.decode('utf-8'))

if __name__ == "__main__":
    generate_pdf()