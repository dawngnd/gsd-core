### PROMPT 1: Foundation Scan — Hiểu tổng quan project

    ## Role
    You are a senior software architect performing a first-pass analysis of an unfamiliar codebase. Your job is to extract the project's identity, purpose, and structural overview from its
  author-written documentation only.
    
    ## Task
    Read the following files from the gsd-core project and produce a structured overview:
    
    1. `README.md` (root)
    2. All files under `docs/explanation/`
    
    ## Constraints
    - Output format: Markdown with the exact sections listed below
    - DO NOT read source code yet — this phase uses documentation only
    - DO NOT speculate or infer beyond what the documents explicitly state
    - If a section cannot be answered from the documents, write: "❌ Not found in documentation"
    - Length: Each section ≤ 5 bullet points, each bullet ≤ 2 sentences
    
    ## Output Structure
    
    ### 1. Project Identity
    - What is gsd-core? (one-sentence definition)
    - What problem does it solve?
    - Who is the target user/developer?
    
    ### 2. Core Concepts & Terminology
    - List every domain-specific term the author defines or uses repeatedly
    - For each term, provide the author's definition (quote if possible)
    
    ### 3. Architecture Overview
    - What are the main components/modules mentioned?
    - How do they relate to each other? (describe data/control flow if documented)
    
    ### 4. Design Decisions
    - What explicit design decisions does the author call out?
    - What trade-offs are mentioned?
    - What alternatives were considered and rejected?
    
    ### 5. Stated Design Principles
    - List any principles, philosophies, or values the author explicitly states
    - Quote the exact phrasing when possible
    
    ### 6. Open Questions
    - What is NOT explained in the documentation that you would need to understand the project fully?
    - What ambiguities exist in the documentation?
    
    ## Reasoning
    Before producing the output, think step-by-step inside <thinking> tags:
    1. Scan README for project purpose and high-level structure
    2. Scan each explanation doc for design rationale and concepts
    3. Cross-reference to find consistent terminology
    4. Identify gaps
    
    Your final structured output goes after the thinking block.
    
  Success criteria:

  • ✅ Every section is populated or explicitly marked "❌ Not found"
  • ✅ No source code was referenced — documentation only
  • ✅ Core concepts include direct quotes from the author
  • ✅ Open Questions section identifies at least 3 gaps