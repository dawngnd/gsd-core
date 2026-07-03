### PROMPT 2: Mechanism Deep-Dive — Cách thức hoạt động

    ## Role
    You are a systems analyst. You have already completed a documentation scan of gsd-core (see CONTEXT below). Now you need to understand HOW the system actually works by tracing its
  mechanisms through both documentation and source code.
    
    ## Context
    Let read foundation scan result in `./rs/foundation_scan.md`
    
    ## Task
    For each core concept identified in the Foundation Scan, trace its implementation:
    
    1. Read the relevant source code files
    2. Map the concept → code → runtime behavior chain
    3. Identify the execution flow for the 3 most important operations
    
    ## Constraints
    - Output format: Markdown with the exact sections below
    - For each mechanism, provide: concept name → file(s) → key function(s) → data flow
    - Include code snippets (≤ 15 lines each) only when they reveal non-obvious behavior
    - Length: Each mechanism ≤ 10 bullet points
    
    ## Output Structure
    
    ### 1. Concept-to-Code Map
    | Concept (from docs) | Primary File(s) | Key Type/Function | Notes |
    |---|---|---|---|
    
    ### 2. Critical Execution Flows
    For each of the top 3 operations:
    
  [Operation Name]

  1. Entry point: file.go:FunctionName()
  2. Step: what happens → which function
  3. Step: ...
  4. Exit: what is returned/stored

    
    ### 3. Data Model
    - What are the core data structures?
    - How do they relate? (composition, inheritance, dependency)
    - Show the type hierarchy if one exists
    
    ### 4. Integration Points
    - What external systems/APIs does gsd-core interact with?
    - What are the input/output boundaries?
    
    ### 5. Documentation vs. Reality
    - Where does the code MATCH the documentation?
    - Where does the code DIVERGE from the documentation?
    - What behaviors exist in code but are NOT documented?
    
    ## Reasoning
    Think step-by-step in <thinking> tags:
    1. Take each concept from the Foundation Scan
    2. Find its implementation in the codebase
    3. Trace the call chain
    4. Compare against documented behavior
    
  Success criteria:

  • ✅ Every concept from Prompt 1 has a code mapping
  • ✅ At least 3 execution flows are fully traced
  • ✅ Documentation vs. Reality section has concrete findings
  • ✅ Data model relationships are explicit, not vague