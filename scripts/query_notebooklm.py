import sys
import os
import json

# Add the local scripts path to import notebooklm_mcp
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from notebooklm_mcp.api_client import NotebookLMClient
from notebooklm_mcp.auth import load_cached_tokens

def main():
    # We check if the first argument is a known action.
    # Otherwise, we default to the legacy behavior: query <notebook_id> <query_text>
    args = sys.argv[1:]
    if not args:
        print(json.dumps({"status": "error", "message": "No arguments provided."}))
        sys.exit(1)
        
    action = "query"
    if args[0] in ["query", "add_text"]:
        action = args[0]
        args = args[1:]
        
    if action == "query":
        if len(args) < 2:
            print(json.dumps({"status": "error", "message": "Usage: query <notebook_id> <query_text>"}))
            sys.exit(1)
        notebook_id = args[0]
        query_text = args[1]
        
        tokens = load_cached_tokens()
        if not tokens:
            print(json.dumps({"status": "error", "message": "Cached Google tokens not found. Run notebooklm-mcp-auth first."}))
            sys.exit(1)
            
        try:
            client = NotebookLMClient(
                cookies=tokens.cookies,
                csrf_token=tokens.csrf_token,
                session_id=tokens.session_id
            )
            response = client.query(notebook_id=notebook_id, query_text=query_text)
            if response:
                print(json.dumps({"status": "success", "data": response}, ensure_ascii=False))
            else:
                print(json.dumps({"status": "error", "message": "Empty response from NotebookLM."}))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
            
    elif action == "add_text":
        if len(args) < 3:
            print(json.dumps({"status": "error", "message": "Usage: add_text <notebook_id> <text_content> <title>"}))
            sys.exit(1)
        notebook_id = args[0]
        text_content = args[1]
        title = args[2]
        
        tokens = load_cached_tokens()
        if not tokens:
            print(json.dumps({"status": "error", "message": "Cached Google tokens not found. Run notebooklm-mcp-auth first."}))
            sys.exit(1)
            
        try:
            client = NotebookLMClient(
                cookies=tokens.cookies,
                csrf_token=tokens.csrf_token,
                session_id=tokens.session_id
            )
            response = client.add_text_source(notebook_id=notebook_id, text=text_content, title=title)
            if response:
                print(json.dumps({"status": "success", "data": response}, ensure_ascii=False))
            else:
                print(json.dumps({"status": "error", "message": "Failed to add text source."}))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))

if __name__ == "__main__":
    main()
