import { createInterface } from 'readline'
import { stdin, stdout } from 'process'

export function askQuestion(prompt: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout })
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
