import { printSchema } from 'graphql'
import { writeFileSync, mkdirSync } from 'fs'
import { schema } from '../src/graphql/schema'

mkdirSync('./docs', { recursive: true })
writeFileSync('./schema.graphql', printSchema(schema))
console.log('schema.graphql exported')
