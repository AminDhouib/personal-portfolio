export interface CodeSnippet {
  language: string;
  snippet: string;
}

export const CODE_SNIPPETS: readonly CodeSnippet[] = Object.freeze([
  {
    language: "Python",
    snippet: `def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("world"))`,
  },
  {
    language: "Python",
    snippet: `squares = [x * x for x in range(10) if x % 2 == 0]`,
  },
  {
    language: "Ruby",
    snippet: `names = %w[alice bob carol]
names.each do |n|
  puts "hi #{n}"
end`,
  },
  {
    language: "JavaScript",
    snippet: `const users = await fetch("/api/users").then(r => r.json());
console.log(users.length);`,
  },
  {
    language: "TypeScript",
    snippet: `type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}`,
  },
  {
    language: "Rust",
    snippet: `fn add(a: i32, b: i32) -> i32 {
    a + b
}

println!("{}", add(2, 3));`,
  },
  {
    language: "Go",
    snippet: `package main

import "fmt"

func main() {
    fmt.Println("hello")
}`,
  },
  {
    language: "Java",
    snippet: `public class Main {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}`,
  },
  {
    language: "C",
    snippet: `#include <stdio.h>

int main(void) {
    printf("hello\\n");
    return 0;
}`,
  },
  {
    language: "Swift",
    snippet: `let greeting = "hello"
print(greeting.uppercased())`,
  },
]);
