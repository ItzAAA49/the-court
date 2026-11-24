# The Court — fresh rebuild

This branch contains a newly created multi-file Node.js courtroom game. The source archive is split into binary parts only to keep each repository upload small. The readable project files are unpacked during the Render build.

## Render Web Service settings

- Repository: https://github.com/ItzAAA49/the-court
- Branch: fresh-rebuild
- Runtime: Node
- Build command:
`cat source.part.* > /tmp/the-court-source.tar.br && node -e "const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/the-court.tar',z.brotliDecompressSync(fs.readFileSync('/tmp/the-court-source.tar.br')))" && tar -xf /tmp/the-court.tar -C . && npm install`
- Start command: `npm start`
- Health check: `/api/health`

Add `OPENAI_API_KEY` in the Render service's Environment settings. Never commit the key to this repository. Set `OPENAI_MODEL` to `gpt-6.2-sol` (the game also defaults to this model). The game runs with built-in fallback scenarios if no key is configured.

The complete readable project is also supplied as `The-Court-project.zip` in the conversation attachment.

All laws, jurisdictions, characters, and cases in this game are fictional.
