# Archeon Validation Rules - Research Summary

## Overview
This document details the validation rules found in the Archeon repository (danaia/archeon), specifically focusing on the three validation rules you requested and how validation can be configured or relaxed.

---

## 1. Validation Rules Location

### Primary File: `archeon/orchestrator/VAL_validator.py`
**GitHub URL:** https://github.com/danaia/archeon/blob/main/archeon/orchestrator/VAL_validator.py

This is the main validation engine that validates chains for structure, cycles, boundaries, and other architectural rules.

### Configuration File: `archeon/config/legend.py`
**GitHub URL:** https://github.com/danaia/archeon/blob/main/archeon/config/legend.py

Contains `BOUNDARY_RULES` that define which glyph-to-glyph connections are allowed.

---

## 2. The Three Validation Rules

### A. **ERR:boundary.vDataFlow** - Views in Data Flow
**Rule:** Views (V:) cannot participate in data flow  
**Location:** `VAL_validator.py` - `validate_boundaries()` method and `legend.py` - `BOUNDARY_RULES`

**Implementation in VAL_validator.py:**
```python
def validate_boundaries(self, ast: ChainAST) -> ValidationResult:
    """Validate ownership boundary rules."""
    result = ValidationResult()
    for edge in ast.edges:
        # ... check if edge violates BOUNDARY_RULES ...
        if 'operator' in rule and rule.get('from') == source.prefix:
            if edge.operator == rule['operator'] and not rule['allowed']:
                result.add_error(
                    f"ERR:boundary.{source.prefix.lower()}DataFlow",
                    rule['reason'],
                    node=source.qualified_name
                )
```

**Related Rules in legend.py:**
```python
BOUNDARY_RULES = [
    # Views cannot participate in data flow
    {'from': 'V', 'operator': '=>', 'allowed': False, 'reason': 'Views cannot participate in data flow'},
    {'from': 'V', 'operator': '~>', 'allowed': False, 'reason': 'Views cannot have reactive edges'},
    {'from': 'V', 'operator': '->', 'allowed': False, 'reason': 'Views cannot have control flow'},
    {'from': 'V', 'operator': '!>', 'allowed': False, 'reason': 'Views cannot trigger side-effects'},
    # ... more rules ...
]
```

**What it means:**
- Views (V:) are boundary glyphs that represent the UI/presentation layer
- They should NOT flow data outward using operators: `=>`, `~>`, `->`, `!>`
- Views should only receive data, not send it

---

### B. **WARN:chain.noOutput** - Chains Without Output
**Rule:** Chains must end with OUT: or ERR: glyph  
**Location:** `VAL_validator.py` - `validate_output()` method

**Implementation:**
```python
def validate_output(self, ast: ChainAST) -> ValidationResult:
    """Check if chain has OUT or ERR node."""
    result = ValidationResult()
    
    # Find terminal nodes (no outgoing edges)
    nodes_with_outgoing = set()
    for edge in ast.edges:
        nodes_with_outgoing.add(edge.source_idx)
    
    terminal_indices = [i for i in range(len(ast.nodes)) 
                       if i not in nodes_with_outgoing]
    
    # Check if any terminal is OUT or ERR
    has_output = False
    for idx in terminal_indices:
        node = ast.nodes[idx]
        if node.prefix in ('OUT', 'ERR'):
            has_output = True
            break
    
    if not has_output and not self._is_containment_chain(ast):
        result.add_warning(
            'WARN:chain.noOutput',
            "Chain does not end with OUT: or ERR: glyph"
        )
    return result
```

**What it means:**
- Every execution chain should conclude with either:
  - `OUT:` (Output) - successful completion path
  - `ERR:` (Error) - failure/exception path
- **Exception:** Containment chains (with only `@` operators) are exempt from this rule
- This is a **warning**, not an error (chains can still work without it)

---

### C. **WARN:api.noErrorPath** - APIs Without Error Handling
**Rule:** API endpoints should have error paths defined  
**Location:** `VAL_validator.py` - `validate_api_error_paths()` method (Graph-level validation)

**Implementation:**
```python
def validate_api_error_paths(self) -> ValidationResult:
    """Check if API endpoints have error paths."""
    result = ValidationResult()
    
    # Collect all API glyphs
    api_glyphs = set()
    api_with_errors = set()
    
    for stored in self.graph.chains:
        for node in stored.ast.nodes:
            if node.prefix == 'API':
                api_glyphs.add(node.qualified_name)
        
        # Check for API -> ERR connections
        err_nodes = [n for n in stored.ast.nodes if n.prefix == 'ERR']
        for edge in stored.ast.edges:
            if edge.source_idx < len(stored.ast.nodes):
                source = stored.ast.nodes[edge.source_idx]
                if source.prefix == 'API' and edge.target_idx < len(stored.ast.nodes):
                    target = stored.ast.nodes[edge.target_idx]
                    if target.prefix == 'ERR':
                        api_with_errors.add(source.qualified_name)
    
    # Warn for APIs without error paths
    for api in api_glyphs:
        if api not in api_with_errors:
            result.add_warning(
                'WARN:api.noErrorPath',
                f"API endpoint {api} has no error path defined",
                node=api
            )
    return result
```

**What it means:**
- Every `API:` glyph should have at least one edge flowing to an `ERR:` (Error) glyph
- This ensures API endpoints have explicit error handling
- This is a **warning**, not an error (APIs can function without it)
- Only reported if there ARE error nodes in the graph but none connected to this API

---

## 3. How Validation Can Be Configured or Relaxed

### A. **Using Specialized Validation Methods**

The `GraphValidator` class provides targeted validation methods:

```python
class GraphValidator:
    def validate(self) -> ValidationResult:
        """Run ALL validations on the graph."""
        # Runs: structure, output, cycles, boundaries, error_paths
    
    def validate_boundaries_only(self) -> ValidationResult:
        """Run ONLY boundary validation."""
        # Allows skipping other checks
    
    def validate_cycles_only(self) -> ValidationResult:
        """Run ONLY cycle validation."""
        # Allows skipping other checks
```

**Usage:** You can selectively run only specific validations by calling these methods instead of the main `validate()` method.

---

### B. **Exceptions Built Into Rules**

Some rules already have built-in exceptions:

1. **Chain Output Rule:** Containment chains are exempt
   ```python
   if not has_output and not self._is_containment_chain(ast):
       result.add_warning(...)  # Only warns if NOT a containment chain
   ```
   - Containment chains use only `@` (containment) operators
   - Example: `V: @ CMP:` (View contains Component)

2. **API Error Path Rule:** Only warns if error nodes exist
   ```python
   if not has_error_path and err_nodes:  # Only warns if ERR: nodes exist
       result.add_warning(...)
   ```
   - If your graph has no `ERR:` nodes at all, no warning is issued

3. **Boundary Rules:** Can be modified in `legend.py`
   ```python
   BOUNDARY_RULES = [
       {'from': 'V', 'operator': '=>', 'allowed': False, 'reason': '...'},
       # Change 'allowed' to True to permit the connection
   ]
   ```

---

### C. **Modifying Validation Behavior (Future Enhancement)**

To make validation configurable, you could:

1. **Add a validation config parameter:**
   ```python
   class GraphValidator:
       def __init__(self, graph: KnowledgeGraph, strict: bool = True):
           self.graph = graph
           self.strict = strict
           self.chain_validator = ChainValidator()
       
       def validate(self) -> ValidationResult:
           result = ValidationResult()
           # ... existing validations ...
           
           if self.strict:
               result.merge(self.validate_boundaries(ast))
               result.merge(self.validate_error_paths(ast))
   ```

2. **Add configuration flags for specific rules:**
   ```python
   VALIDATION_CONFIG = {
       'enforce_output': True,      # WARN:chain.noOutput
       'enforce_error_paths': True, # WARN:api.noErrorPath
       'enforce_boundaries': True,  # ERR:boundary.*
   }
   ```

3. **Modify BOUNDARY_RULES to disable specific checks:**
   ```python
   # In legend.py, change 'allowed' to True:
   {'from': 'V', 'operator': '=>', 'allowed': True, 'reason': 'Views participate in data flow'},
   ```

---

## 4. Validation Architecture

### Class Hierarchy
```
ValidationResult (dataclass)
├── valid: bool
├── errors: list[ValidationError]
└── warnings: list[ValidationWarning]

ChainValidator
├── validate(ast: ChainAST) -> ValidationResult
├── validate_structure(ast)
├── validate_output(ast)        # <-- WARN:chain.noOutput
├── validate_cycles(ast)
├── validate_boundaries(ast)    # <-- ERR:boundary.vDataFlow
└── validate_error_paths(ast)

GraphValidator
├── __init__(graph: KnowledgeGraph)
├── validate() -> ValidationResult
├── validate_duplicates()
├── validate_versions()
├── validate_api_error_paths()  # <-- WARN:api.noErrorPath
├── validate_boundaries_only()
└── validate_cycles_only()
```

---

## 5. Summary Table

| Rule Code | Type | Severity | Definition File | Check Method | Exception |
|-----------|------|----------|-----------------|--------------|-----------|
| `ERR:boundary.vDataFlow` | Boundary | ERROR | `legend.py` | `validate_boundaries()` | None (strict) |
| `WARN:chain.noOutput` | Output | WARNING | `VAL_validator.py` | `validate_output()` | Containment chains (`@` only) |
| `WARN:api.noErrorPath` | API | WARNING | `VAL_validator.py` | `validate_api_error_paths()` | No ERR: nodes in graph |

---

## 6. How to Relax Validation

### Option 1: Modify BOUNDARY_RULES (Most Direct)
Edit `archeon/config/legend.py`:
```python
# Change this:
{'from': 'V', 'operator': '=>', 'allowed': False, ...}
# To this:
{'from': 'V', 'operator': '=>', 'allowed': True, ...}
```

### Option 2: Use Targeted Validation Methods
Instead of calling `GraphValidator.validate()`, call:
- `validate_cycles_only()` - Skip boundary checks
- `validate_boundaries_only()` - Check only boundaries

### Option 3: Add Configuration Layer
Extend `GraphValidator` and `ChainValidator` to support a configuration flag that:
- Skips specific validation methods
- Converts errors to warnings
- Disables certain rule checks

### Option 4: Post-Process Validation Results
Filter out specific error/warning codes before reporting:
```python
result = validator.validate()
# Remove specific warnings
result.warnings = [w for w in result.warnings 
                   if w.code != 'WARN:chain.noOutput']
```

---

## File References

| File Path | Purpose |
|-----------|---------|
| `archeon/orchestrator/VAL_validator.py` | Main validation engine with ChainValidator and GraphValidator |
| `archeon/config/legend.py` | BOUNDARY_RULES and glyph/edge definitions |
| `archeon/orchestrator/PRS_parser.py` | Defines ChainAST and GlyphNode structures |
| `archeon/orchestrator/GRF_graph.py` | Defines KnowledgeGraph structure |

